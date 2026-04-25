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

  // Format as conversation thread with full email content
  const thread = (activities || []).map(a => {
    const d = a.data as any;
    // For outgoing emails: show the actual email subject + body
    const isOutgoingEmail = a.type === 'email' && !d?.auto_reply;
    const isReply = a.type === 'email_replied';

    let message = '';
    let subject = '';

    if (isOutgoingEmail) {
      subject = d?.subject || '';
      // Show the real email body (strip HTML tags for display)
      const rawBody = d?.body || d?.message || a.description || '';
      message = rawBody.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"').substring(0, 1000);
    } else if (isReply) {
      subject = 'Réponse reçue';
      message = d?.reply_content || d?.reply_preview || d?.message || a.description || '';
    } else {
      message = d?.reply_content || d?.message || d?.reply_preview || a.description || '';
    }

    return {
      id: a.id,
      type: a.type,
      direction: isOutgoingEmail || d?.auto_reply || d?.manual_reply ? 'outgoing' : a.type === 'email_replied' ? 'incoming' : 'outgoing',
      subject,
      message,
      channel: a.type?.includes('dm') ? 'dm_instagram' : a.type?.includes('email') ? 'email' : a.type || 'other',
      date: a.created_at,
      // auto = AI authored (cold sequence step OR Hugo auto-reply).
      // manual_reply = founder typed it from the panel — explicitly not auto.
      auto: !!(d?.auto_reply || d?.auto || d?.is_sequence_step) && !d?.manual_reply,
      provider: d?.provider || null,
      step: d?.step || null,
      // Hugo unsubscribe / blacklist flags surface on the message
      // bubble so the founder sees at a glance which conversations
      // were closed automatically.
      action_taken: d?.action_taken || null,
    };
  });

  return NextResponse.json({ ok: true, prospect, thread });
}
