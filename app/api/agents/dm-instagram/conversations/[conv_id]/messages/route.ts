import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';

export const runtime = 'nodejs';
export const maxDuration = 15;

/**
 * GET /api/agents/dm-instagram/conversations/[conv_id]/messages
 *
 * Fetch the last N messages of ONE conversation. Split out from the list
 * endpoint because bulk-fetching messages for every conversation on every
 * 10s poll was hitting Meta's "Application request limit" app-wide. The
 * client fetches messages only when the user selects a thread.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ conv_id: string }> | { conv_id: string } }
) {
  const resolved = await (params as any);
  const convId: string | undefined = resolved?.conv_id;
  if (!convId) return NextResponse.json({ ok: false, error: 'conv_id requis' }, { status: 400 });

  const { user, error } = await getAuthUser();
  if (error || !user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 });

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin, instagram_business_account_id, instagram_igaa_token, facebook_page_access_token, facebook_page_id')
    .eq('id', user.id)
    .single();

  if (!profile?.instagram_business_account_id && !profile?.is_admin) {
    return NextResponse.json({ ok: true, connected: false, messages: [] });
  }

  // IGAA takes priority — it's the only token that reliably reads DM content
  const igaa = profile?.instagram_igaa_token;
  const fb = profile?.facebook_page_access_token;
  const token = igaa || fb;
  if (!token) return NextResponse.json({ ok: true, connected: false, messages: [] });

  const domain = igaa ? 'graph.instagram.com' : 'graph.facebook.com';
  const myIds = new Set([profile.instagram_business_account_id, profile.facebook_page_id].filter(Boolean));

  const limit = Math.min(Number(req.nextUrl.searchParams.get('limit') || 20), 50);

  try {
    const res = await fetch(
      `https://${domain}/v21.0/${convId}/messages?fields=id,message,from,created_time,attachments&limit=${limit}&access_token=${encodeURIComponent(token)}`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      // Meta's rate-limit error — propagate so the UI can surface it instead
      // of silently showing an empty thread.
      console.warn(`[DM-msgs] conv ${convId}: HTTP ${res.status} ${errText.substring(0, 200)}`);
      return NextResponse.json({
        ok: false,
        connected: true,
        messages: [],
        error: res.status === 429 || errText.includes('request limit') ? 'rate_limited' : 'api_error',
        detail: errText.substring(0, 200),
      });
    }
    const data = await res.json();
    const messages = (data.data || []).map((m: any) => {
      const rawAttachments = m.attachments?.data || [];
      const attachments = rawAttachments.map((a: any) => ({
        type: (a.image_data ? 'image' : a.video_data ? 'video' : a.file_url ? 'file' : a.type || 'unknown'),
        url: a.image_data?.url || a.image_data?.preview_url || a.video_data?.url || a.file_url || a.payload?.url || '',
      })).filter((a: any) => a.url);
      return {
        id: m.id,
        message: m.message || '',
        from: m.from?.username || m.from?.name || '?',
        fromMe: myIds.has(m.from?.id),
        created_time: m.created_time,
        ...(attachments.length > 0 ? { attachments } : {}),
      };
    }).reverse();

    return new NextResponse(JSON.stringify({ ok: true, connected: true, messages }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'private, max-age=5',
      },
    });
  } catch (e: any) {
    console.error('[DM-msgs] error:', e.message);
    return NextResponse.json({ ok: false, connected: true, messages: [], error: e.message });
  }
}
