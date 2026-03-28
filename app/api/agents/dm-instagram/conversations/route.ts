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

  // Get IG tokens — try user's profile first, then admin
  let igToken: string | null = null;
  let igUserId: string | null = null;

  const { data: userProfile } = await supabase
    .from('profiles')
    .select('instagram_business_account_id, instagram_access_token, facebook_page_access_token')
    .eq('id', user.id)
    .single();

  // For Instagram API conversations, we need the IG API token
  // Check if there's a stored IG API token, otherwise use FB page token
  igToken = userProfile?.instagram_access_token || userProfile?.facebook_page_access_token;
  igUserId = userProfile?.instagram_business_account_id;

  if (!igToken || !igUserId) {
    // Fallback to admin
    const { data: adminProfile } = await supabase
      .from('profiles')
      .select('instagram_business_account_id, instagram_access_token, facebook_page_access_token')
      .eq('is_admin', true)
      .single();

    igToken = adminProfile?.instagram_access_token || adminProfile?.facebook_page_access_token;
    igUserId = adminProfile?.instagram_business_account_id;
  }

  if (!igToken || !igUserId) {
    return NextResponse.json({ ok: true, conversations: [], message: 'Instagram non connecte' });
  }

  try {
    // Fetch conversations
    const convRes = await fetch(
      `https://graph.facebook.com/v25.0/${igUserId}/conversations?fields=id,participants,updated_time&access_token=${igToken}`
    );

    if (!convRes.ok) {
      // Try Instagram Graph API instead
      const igConvRes = await fetch(
        `https://graph.instagram.com/v25.0/me/conversations?fields=id,participants,updated_time&access_token=${igToken}`
      );
      if (!igConvRes.ok) {
        return NextResponse.json({ ok: true, conversations: [], message: 'API conversations non disponible' });
      }
      const igConvData = await igConvRes.json();
      return await processConversations(igConvData, igToken, igUserId, 'instagram');
    }

    const convData = await convRes.json();
    return await processConversations(convData, igToken, igUserId, 'facebook');
  } catch (e: any) {
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
