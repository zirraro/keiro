import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/me/inbox?direction=all|inbox|sent&limit=50
 *
 * Aggregates inbound + outbound emails for the caller into a single
 * timeline so the EmailPanel can show every message — including
 * those from senders that aren't in the CRM.
 *
 * Inbound: from agent_logs action='inbound_processed' (full body
 * stored by the IMAP poll).
 * Outbound: from crm_activities type='email' (Hugo cold + Hugo
 * auto-replies + manual sends from the panel).
 *
 * Returns emails sorted by date desc.
 */
export async function GET(req: NextRequest) {
  const { user } = await getAuthUser();
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const direction = (req.nextUrl.searchParams.get('direction') || 'all').toLowerCase();
  const limit = Math.min(200, Math.max(10, parseInt(req.nextUrl.searchParams.get('limit') || '60')));

  const items: Array<{
    id: string;
    direction: 'inbox' | 'sent';
    date: string;
    from_email?: string;
    from_name?: string;
    to_email?: string;
    subject: string;
    body: string;
    message_id?: string;
    classification?: string | null;
    auto?: boolean;
    prospect_id?: string | null;
    blacklisted?: boolean;
  }> = [];

  if (direction === 'all' || direction === 'inbox') {
    const { data: inbound } = await sb
      .from('agent_logs')
      .select('id, data, created_at')
      .eq('agent', 'email')
      .eq('action', 'inbound_processed')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(limit);
    for (const row of (inbound || []) as any[]) {
      const d = row.data || {};
      if (!d.from_email && !d.from) continue;
      items.push({
        id: row.id,
        direction: 'inbox',
        date: row.created_at,
        from_email: d.from_email || d.from,
        from_name: d.from_name || undefined,
        subject: d.subject || '(sans objet)',
        body: d.body || '',
        message_id: d.message_id,
        classification: d.classification || null,
      });
    }
  }

  if (direction === 'all' || direction === 'sent') {
    // Outbound: pull from crm_activities (where Hugo's actual sent
    // emails are logged with body) for prospects belonging to this user.
    const { data: prospects } = await sb
      .from('crm_prospects')
      .select('id')
      .eq('user_id', user.id)
      .limit(2000);
    const prospectIds = (prospects || []).map((p: any) => p.id);
    if (prospectIds.length > 0) {
      const { data: outbound } = await sb
        .from('crm_activities')
        .select('id, prospect_id, type, description, data, created_at')
        .in('prospect_id', prospectIds)
        .eq('type', 'email')
        .order('created_at', { ascending: false })
        .limit(limit);
      for (const row of (outbound || []) as any[]) {
        const d = row.data || {};
        items.push({
          id: row.id,
          direction: 'sent',
          date: row.created_at,
          to_email: d.to_email || d.email || undefined,
          subject: d.subject || (row.description || '').substring(0, 80),
          body: d.body || d.message || row.description || '',
          message_id: d.message_id,
          auto: !!(d.auto_reply || d.auto || d.is_sequence_step) && !d.manual_reply,
          prospect_id: row.prospect_id,
        });
      }
    }
  }

  // Mark blacklisted senders so the UI can show a badge.
  const { data: bl } = await sb
    .from('email_blacklist')
    .select('email')
    .eq('client_id', user.id)
    .limit(2000);
  const blSet = new Set((bl || []).map((b: any) => (b.email || '').toLowerCase()));
  for (const it of items) {
    const target = (it.direction === 'inbox' ? it.from_email : it.to_email)?.toLowerCase();
    if (target && blSet.has(target)) it.blacklisted = true;
  }

  items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return NextResponse.json({
    ok: true,
    items: items.slice(0, limit),
    counts: {
      inbox: items.filter(i => i.direction === 'inbox').length,
      sent: items.filter(i => i.direction === 'sent').length,
    },
  });
}
