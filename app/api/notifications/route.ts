import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * GET /api/notifications — Get client notifications (unread + recent)
 * POST /api/notifications — Mark notification(s) as read
 */
export async function GET() {
  const { user } = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });

  // Get unread count + last 50 notifications
  const { data: notifications } = await supabase
    .from('client_notifications')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50);

  const unreadCount = (notifications || []).filter(n => !n.read).length;

  // Hot prospects needing human intervention
  const { data: hotProspects } = await supabase
    .from('crm_prospects')
    .select('id, company, email, type, status, temperature')
    .eq('temperature', 'hot')
    .in('status', ['repondu', 'interesse', 'demo'])
    .order('updated_at', { ascending: false })
    .limit(10);

  // Count badges per agent
  const badges: Record<string, number> = {};
  for (const n of (notifications || [])) {
    if (!n.read && n.agent) badges[n.agent] = (badges[n.agent] || 0) + 1;
  }
  // Hot prospects add to DM + email + commercial badges
  for (const p of (hotProspects || [])) {
    badges['dm_instagram'] = (badges['dm_instagram'] || 0) + 1;
    badges['email'] = (badges['email'] || 0) + 1;
    badges['commercial'] = (badges['commercial'] || 0) + 1;
  }

  const totalPending = unreadCount + (hotProspects?.length || 0);

  return NextResponse.json({
    notifications: notifications || [],
    unreadCount,
    totalPending,
    badges,
    hotProspects: (hotProspects || []).map(p => ({
      id: p.id,
      company: p.company || p.email,
      type: p.type,
      status: p.status,
    })),
  });
}

export async function POST(req: NextRequest) {
  const { user } = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Non authentifie' }, { status: 401 });

  const { action, notificationId, notificationIds } = await req.json();

  if (action === 'mark_read' && notificationId) {
    await supabase
      .from('client_notifications')
      .update({ read: true })
      .eq('id', notificationId)
      .eq('user_id', user.id);
  }

  if (action === 'mark_all_read') {
    await supabase
      .from('client_notifications')
      .update({ read: true })
      .eq('user_id', user.id)
      .eq('read', false);
  }

  if (action === 'mark_read_bulk' && notificationIds?.length) {
    await supabase
      .from('client_notifications')
      .update({ read: true })
      .in('id', notificationIds)
      .eq('user_id', user.id);
  }

  return NextResponse.json({ ok: true });
}
