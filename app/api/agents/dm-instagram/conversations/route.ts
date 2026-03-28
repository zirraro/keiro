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

  // Get IG tokens — try user's profile first, then admin, then any connected profile
  let igToken: string | null = null;
  let igUserId: string | null = null;

  const { data: userProfile } = await supabase
    .from('profiles')
    .select('instagram_business_account_id, instagram_access_token, facebook_page_access_token, email')
    .eq('id', user.id)
    .single();

  console.log(`[DM-conversations] User ${userProfile?.email || user.id}: ig_account=${userProfile?.instagram_business_account_id || 'null'}, has_ig_token=${!!userProfile?.instagram_access_token}, has_fb_token=${!!userProfile?.facebook_page_access_token}`);

  igToken = userProfile?.instagram_access_token || userProfile?.facebook_page_access_token;
  igUserId = userProfile?.instagram_business_account_id;

  if (!igToken || !igUserId) {
    // Fallback: admin profile
    const { data: adminProfile } = await supabase
      .from('profiles')
      .select('instagram_business_account_id, instagram_access_token, facebook_page_access_token')
      .eq('is_admin', true)
      .limit(1)
      .maybeSingle();

    if (adminProfile) {
      igToken = adminProfile.instagram_access_token || adminProfile.facebook_page_access_token;
      igUserId = adminProfile.instagram_business_account_id;
      console.log(`[DM-conversations] Fallback to admin: ig_account=${igUserId || 'null'}, has_token=${!!igToken}`);
    }
  }

  if (!igToken || !igUserId) {
    // Last fallback: any profile with IG connected
    const { data: anyProfile } = await supabase
      .from('profiles')
      .select('instagram_business_account_id, instagram_access_token, facebook_page_access_token')
      .not('instagram_business_account_id', 'is', null)
      .not('facebook_page_access_token', 'is', null)
      .limit(1)
      .maybeSingle();

    if (anyProfile) {
      igToken = anyProfile.instagram_access_token || anyProfile.facebook_page_access_token;
      igUserId = anyProfile.instagram_business_account_id;
      console.log(`[DM-conversations] Fallback to any connected profile: ig_account=${igUserId}`);
    }
  }

  if (!igToken || !igUserId) {
    console.warn(`[DM-conversations] No IG token found for user ${user.id}`);
    return NextResponse.json({ ok: true, conversations: [], message: 'Instagram non connecte' });
  }

  console.log(`[DM-conversations] Using ig_account=${igUserId}, token_length=${igToken.length}`);

  try {
    // Fetch conversations — try Facebook Graph API first
    console.log(`[DM-conversations] Fetching from Facebook Graph API for ${igUserId}...`);
    const convRes = await fetch(
      `https://graph.facebook.com/v25.0/${igUserId}/conversations?fields=id,participants,updated_time&access_token=${igToken}`
    );

    if (!convRes.ok) {
      const fbError = await convRes.text().catch(() => 'unknown');
      console.warn(`[DM-conversations] Facebook API failed (${convRes.status}): ${fbError.substring(0, 200)}`);

      // Try Instagram Graph API instead
      console.log(`[DM-conversations] Trying Instagram Graph API...`);
      const igConvRes = await fetch(
        `https://graph.instagram.com/v25.0/me/conversations?fields=id,participants,updated_time&access_token=${igToken}`
      );
      if (!igConvRes.ok) {
        const igError = await igConvRes.text().catch(() => 'unknown');
        console.warn(`[DM-conversations] Instagram API also failed (${igConvRes.status}): ${igError.substring(0, 200)}`);
        return NextResponse.json({ ok: true, conversations: [], message: 'API conversations non disponible', debug: { fbStatus: convRes.status, igStatus: igConvRes.status } });
      }
      const igConvData = await igConvRes.json();
      console.log(`[DM-conversations] Instagram API returned ${igConvData.data?.length || 0} conversations`);
      return await processConversations(igConvData, igToken, igUserId, 'instagram');
    }

    const convData = await convRes.json();
    console.log(`[DM-conversations] Facebook API returned ${convData.data?.length || 0} conversations`);
    return await processConversations(convData, igToken, igUserId, 'facebook');
  } catch (e: any) {
    console.error(`[DM-conversations] Error:`, e.message);
    return NextResponse.json({ ok: true, conversations: [], error: e.message });
  }
}

async function processConversations(convData: any, token: string, myId: string, apiType: string) {
  const conversations: Array<{
    id: string;
    participant: { username: string; id: string };
    updated_time: string;
    messages: Array<{ id: string; message: string; from: string; fromMe: boolean; created_time: string }>;
  }> = [];

  for (const conv of (convData.data || []).slice(0, 10)) {
    // Get the other participant
    const otherParticipant = conv.participants?.data?.find((p: any) => p.id !== myId) || { username: 'inconnu', id: '?' };

    // Fetch messages
    try {
      const domain = apiType === 'instagram' ? 'graph.instagram.com' : 'graph.facebook.com';
      const msgRes = await fetch(
        `https://${domain}/v25.0/${conv.id}/messages?fields=id,message,from,created_time&limit=20&access_token=${token}`
      );

      let messages: any[] = [];
      if (msgRes.ok) {
        const msgData = await msgRes.json();
        messages = (msgData.data || []).map((m: any) => ({
          id: m.id,
          message: m.message || '',
          from: m.from?.username || m.from?.name || '?',
          fromMe: m.from?.id === myId,
          created_time: m.created_time,
        })).reverse(); // Chronological order
      }

      conversations.push({
        id: conv.id,
        participant: { username: otherParticipant.username || otherParticipant.name, id: otherParticipant.id },
        updated_time: conv.updated_time,
        messages,
      });
    } catch {}
  }

  return NextResponse.json({ ok: true, conversations });
}
