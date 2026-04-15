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

  const body = await req.json().catch(() => ({}));
  const { dm_id, status } = body;
  if (!dm_id) return NextResponse.json({ error: 'dm_id requis' }, { status: 400 });

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  // Get the DM from queue
  const { data: dm } = await supabase.from('dm_queue').select('*').eq('id', dm_id).single();
  if (!dm) return NextResponse.json({ error: 'DM introuvable' }, { status: 404 });

  const now = new Date().toISOString();

  // "blocked" path: the human operator clicked "DMs blocked" after seeing
  // Instagram's native "can't message" screen. Mark the DM as skipped and
  // remove the prospect from the DM channel so future campaigns skip them.
  if (status === 'blocked') {
    await supabase.from('dm_queue').update({
      status: 'skipped',
      error_message: 'Prospect has DMs disabled (human verified)',
      verified_at: now,
      verified_exists: false,
    }).eq('id', dm_id);

    await supabase.from('crm_prospects').update({
      dm_status: 'blocked',
      updated_at: now,
    }).eq('id', dm.prospect_id);

    await supabase.from('crm_activities').insert({
      prospect_id: dm.prospect_id,
      type: 'dm_blocked',
      description: `Prospect @${dm.handle} a bloque les DMs — retire du canal`,
      data: { channel: 'instagram', handle: dm.handle, source: 'human_verified' },
      created_at: now,
    });

    return NextResponse.json({ ok: true, blocked: true });
  }

  // Default path: mark as sent (human clicked Send and pasted in IG).
  await supabase.from('dm_queue').update({
    status: 'sent',
    sent_at: now,
  }).eq('id', dm_id);

  await supabase.from('crm_prospects').update({
    dm_status: 'sent',
    dm_sent_at: now,
    status: 'contacte',
    updated_at: now,
  }).eq('id', dm.prospect_id);

  await supabase.from('crm_activities').insert({
    prospect_id: dm.prospect_id,
    type: 'dm_sent',
    description: `DM envoye manuellement a @${dm.handle}`,
    data: { channel: 'instagram', handle: dm.handle, manual: true },
    created_at: now,
  });

  return NextResponse.json({ ok: true, sent: true });
}
