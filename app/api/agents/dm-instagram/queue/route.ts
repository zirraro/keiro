import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';

export const runtime = 'nodejs';

/**
 * GET /api/agents/dm-instagram/queue
 * Get pending DMs for the authenticated client to preview and send.
 */
export async function GET() {
  const { user, error } = await getAuthUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  // Get prospect IDs owned by this user
  const { data: prospects } = await supabase
    .from('crm_prospects')
    .select('id, company')
    .or(`user_id.eq.${user.id},created_by.eq.${user.id}`)
    .limit(1000);

  const prospectMap = new Map((prospects || []).map(p => [p.id, p.company]));
  const prospectIds = [...prospectMap.keys()];

  if (prospectIds.length === 0) {
    return NextResponse.json({ ok: true, queue: [] });
  }

  // Get pending DMs for these prospects
  const { data: queue } = await supabase
    .from('dm_queue')
    .select('id, prospect_id, handle, message, channel, priority, created_at')
    .eq('status', 'pending')
    .eq('channel', 'instagram')
    .in('prospect_id', prospectIds.slice(0, 200))
    .order('priority', { ascending: false })
    .limit(20);

  const result = (queue || []).map(dm => ({
    ...dm,
    company: prospectMap.get(dm.prospect_id) || null,
  }));

  return NextResponse.json({ ok: true, queue: result });
}
