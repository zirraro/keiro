import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';

export const runtime = 'nodejs';

/**
 * GET /api/crm/thread?prospect_id=xxx
 * Get the full conversation thread with a prospect (emails sent, replies received, DMs).
 */
export async function GET(req: NextRequest) {
  const { user, error } = await getAuthUser();
  if (error || !user) return NextResponse.json({ error: 'Non autorise' }, { status: 401 });

  const prospectId = req.nextUrl.searchParams.get('prospect_id');
  if (!prospectId) return NextResponse.json({ error: 'prospect_id requis' }, { status: 400 });

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  // Get prospect info
  const { data: prospect } = await supabase
    .from('crm_prospects')
    .select('id, first_name, last_name, email, phone, company, status, temperature, type, instagram, score')
    .eq('id', prospectId)
    .single();

  if (!prospect) return NextResponse.json({ error: 'Prospect introuvable' }, { status: 404 });

  // Get all activities for this prospect (emails, DMs, calls, etc.)
  const { data: activities } = await supabase
    .from('crm_activities')
    .select('id, type, description, data, created_at')
    .eq('prospect_id', prospectId)
    .order('created_at', { ascending: true })
    .limit(100);

  // Format as conversation thread
  const thread = (activities || []).map(a => ({
    id: a.id,
    type: a.type, // email, email_replied, dm_instagram, call, etc.
    direction: (a.data as any)?.auto_reply || (a.data as any)?.manual_reply || a.type === 'email' ? 'outgoing' : 'incoming',
    message: (a.data as any)?.reply_content || (a.data as any)?.message || (a.data as any)?.reply_preview || a.description || '',
    channel: a.type?.includes('dm') ? 'dm_instagram' : a.type?.includes('email') ? 'email' : a.type || 'other',
    date: a.created_at,
    auto: !!(a.data as any)?.auto_reply,
  }));

  return NextResponse.json({ ok: true, prospect, thread });
}
