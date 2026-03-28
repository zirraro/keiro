import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

/**
 * POST /api/webhooks/resend
 * Resend webhook for email delivery events (delivered, opened, clicked, bounced, complained).
 * Updates CRM prospect email tracking data.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const now = new Date().toISOString();

    const eventType = body.type; // email.delivered, email.opened, email.clicked, email.bounced, email.complained
    const email = body.data?.to?.[0] || body.data?.email;
    const subject = body.data?.subject;

    if (!eventType || !email) {
      return NextResponse.json({ ok: true }); // Always 200 for webhooks
    }

    console.log(`[ResendWebhook] ${eventType} for ${email}`);

    // Find prospect by email
    const { data: prospect } = await supabase
      .from('crm_prospects')
      .select('id, email_opens_count, email_clicks_count')
      .eq('email', email)
      .single();

    if (!prospect) {
      console.log(`[ResendWebhook] No prospect found for ${email}`);
      return NextResponse.json({ ok: true });
    }

    const updates: Record<string, any> = { updated_at: now };

    if (eventType === 'email.delivered') {
      updates.last_email_sent_at = now;
    } else if (eventType === 'email.opened') {
      updates.last_email_opened_at = now;
      updates.email_opens_count = (prospect.email_opens_count || 0) + 1;
    } else if (eventType === 'email.clicked') {
      updates.last_email_clicked_at = now;
      updates.email_clicks_count = (prospect.email_clicks_count || 0) + 1;
      updates.temperature = 'hot'; // Clicked = very interested
    } else if (eventType === 'email.bounced') {
      updates.email_sequence_status = 'bounced';
      updates.temperature = 'dead';
    } else if (eventType === 'email.complained') {
      updates.email_sequence_status = 'stopped';
      updates.temperature = 'dead';
    }

    await supabase.from('crm_prospects').update(updates).eq('id', prospect.id);

    // Log activity
    await supabase.from('crm_activities').insert({
      prospect_id: prospect.id,
      type: `email_${eventType.replace('email.', '')}`,
      description: `Email ${eventType.replace('email.', '')}: ${subject || email}`,
      data: { event: eventType, email, subject },
      created_at: now,
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('[ResendWebhook] Error:', e.message);
    return NextResponse.json({ ok: true }); // Always 200
  }
}
