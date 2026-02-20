import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  try {
    const { user, error: authError } = await getAuthUser();
    if (authError || !user) {
      return NextResponse.json({ unreadCount: 0 });
    }

    const since = new URL(req.url).searchParams.get('since') || '1970-01-01T00:00:00Z';
    const sinceDate = new Date(since);

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single();

    if (profile?.is_admin) {
      // Admin: count requests with new user messages since last read
      const { data: requests } = await supabaseAdmin
        .from('contact_requests')
        .select('messages')
        .neq('status', 'resolved');

      const count = (requests || []).filter(r => {
        const userMsgs = (r.messages || []).filter((m: any) => m.from === 'user');
        const lastMsg = userMsgs[userMsgs.length - 1];
        return lastMsg && new Date(lastMsg.at) > sinceDate;
      }).length;

      return NextResponse.json({ unreadCount: count });
    } else {
      // User: count own requests with new admin messages since last read
      const { data: requests } = await supabaseAdmin
        .from('contact_requests')
        .select('messages')
        .eq('user_id', user.id);

      const count = (requests || []).filter(r => {
        const adminMsgs = (r.messages || []).filter((m: any) => m.from === 'admin');
        const lastMsg = adminMsgs[adminMsgs.length - 1];
        return lastMsg && new Date(lastMsg.at) > sinceDate;
      }).length;

      return NextResponse.json({ unreadCount: count });
    }
  } catch (err) {
    console.error('GET /api/contact-requests/unread error:', err);
    return NextResponse.json({ unreadCount: 0 });
  }
}
