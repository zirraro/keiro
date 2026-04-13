import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';

export const runtime = 'nodejs';

/**
 * POST /api/agents/dm-instagram/send-single
 * Mark a DM as sent (client has copied and sent it manually via Instagram).
 * Body: { dm_id: string }
 */
export async function POST(req: NextRequest) {
  const { user, error } = await getAuthUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { dm_id } = await req.json();
  if (!dm_id) return NextResponse.json({ error: 'dm_id requis' }, { status: 400 });

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  // Get the DM from queue
  const { data: dm } = await supabase.from('dm_queue').select('*').eq('id', dm_id).single();
  if (!dm) return NextResponse.json({ error: 'DM introuvable' }, { status: 404 });

  const now = new Date().toISOString();

  // Mark as sent in queue
  await supabase.from('dm_queue').update({
    status: 'sent',
    sent_at: now,
  }).eq('id', dm_id);

  // Update prospect CRM
  await supabase.from('crm_prospects').update({
    dm_status: 'sent',
    dm_sent_at: now,
    status: 'contacte',
    updated_at: now,
  }).eq('id', dm.prospect_id);

  // Log activity
  await supabase.from('crm_activities').insert({
    prospect_id: dm.prospect_id,
    type: 'dm_sent',
    description: `DM envoye manuellement a @${dm.handle}`,
    data: { channel: 'instagram', handle: dm.handle, manual: true },
    created_at: now,
  });

  return NextResponse.json({ ok: true, sent: true });
}
